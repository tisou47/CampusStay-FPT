package vn.fpt.campusstay.cfg.internal;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface RoomTypeRepository extends JpaRepository<RoomTypeEntity, Long> {

    @Query("select t from RoomTypeEntity t where lower(t.name) = lower(:name)")
    Optional<RoomTypeEntity> findByNameIgnoreCase(@Param("name") String name);

    @Query("select coalesce(max(t.sortOrder), 0) from RoomTypeEntity t")
    int maxSortOrder();

    @Query("select t from RoomTypeEntity t order by t.sortOrder, t.beds, t.name")
    List<RoomTypeEntity> findAllOrdered();
}
